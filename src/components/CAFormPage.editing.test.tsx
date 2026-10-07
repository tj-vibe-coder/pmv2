import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CAFormPage from './CAFormPage';

let mockRole = 'user';
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', role: mockRole, username: 'Owner' } }) }));
jest.mock('../contexts/OneDriveAuthContext', () => ({ useOneDriveAuth: () => ({ isAuthenticated: false, getAccessToken: jest.fn() }) }));
jest.mock('../services/receiptParseService', () => ({ parseReceipt: jest.fn() }));
jest.mock('../services/onedriveFolderService', () => ({}));
jest.mock('./PdfPreviewDialog', () => ({ __esModule: true, default: () => null }));
jest.mock('./finance/MoneyTrailButton', () => ({ __esModule: true, default: () => null }));
jest.mock('jspdf', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('jspdf-autotable', () => ({ autoTable: jest.fn() }));

const records = ['pending', 'approved'].map((status, i) => ({
  id: `ca${i}`, ca_no: `CA-${i}`, user_id: 'owner', status, purpose: 'Site visit',
  amount: 100, balance_remaining: status === 'approved' ? 40 : 0,
  project_id: null, requested_at: 1791244800, created_at: 1791244800,
  breakdown: [{ category: 'Transportation', description: 'Fare', amount: 100 }],
}));
beforeEach(() => {
  mockRole = 'user';
  localStorage.setItem('netpacific_token', 'test-token');
  Object.defineProperty(global, 'crypto', { configurable: true, value: { randomUUID: () => String(Math.random()) } });
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn(async (url, options) => ({
    json: async () => options?.method === 'PATCH' ? { success: true, ca_no: 'CA-0' }
      : String(url).endsWith('/cash-advances') ? { success: true, cash_advances: records }
        : String(url).endsWith('/projects') ? [] : { success: true, liquidations: [], users: [] },
  } as Response));
});
afterEach(() => jest.restoreAllMocks());

const mount = () => render(<MemoryRouter><CAFormPage /></MemoryRouter>);

test('owner edits pending CA using existing form and saves to details endpoint', async () => {
  mount();
  const edit = await screen.findByRole('button', { name: 'Edit' });
  expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
  fireEvent.click(edit);
  expect(screen.getByLabelText(/Purpose \/ prospect/)).toHaveValue('Site visit');
  fireEvent.change(screen.getByLabelText(/Purpose \/ prospect/), { target: { value: 'Updated visit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/cash-advances/ca0/details'), expect.objectContaining({ method: 'PATCH' })));
  await screen.findByText('Cash advance updated');
  expect(screen.getByRole('button', { name: 'Request CA' })).toBeInTheDocument();
});

test('superadmin can open approved request; cancelling makes no write', async () => {
  mockRole = 'superadmin';
  mount();
  await screen.findByText('CA-1');
  const edits = screen.getAllByRole('button', { name: 'Edit' });
  expect(edits).toHaveLength(2);
  fireEvent.click(edits[1]);
  expect(screen.getByText('Edit Cash Advance CA-1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
  expect(screen.getByRole('button', { name: 'Request CA' })).toBeInTheDocument();
  expect((fetch as jest.Mock).mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
});

test('ordinary admin has no edit action for approved request', async () => {
  mockRole = 'admin';
  mount();
  await screen.findByText('CA-1');
  expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
});
