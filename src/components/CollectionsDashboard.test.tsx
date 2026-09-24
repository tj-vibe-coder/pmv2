import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CollectionsDashboard from './CollectionsDashboard';
import type { ProjectInvoice } from '../types/Invoice';
import type { Project } from '../types/Project';
import type { StatementOfAccount } from '../types/StatementOfAccount';

const mockProjects: Project[] = [
  {
    id: 'p1',
    project_no: '2026-001',
    project_name: 'Ebecor MES',
    account_name: 'Ebecor Inc',
    contract_amount: 500000,
    actual_site_progress_percent: 50,
    billing_schedule: [
      { id: 'm1', label: 'Down Payment', trigger_pct: 0, billing_pct: 30, pb_number: 'PB1' },
      { id: 'm2', label: 'Midway', trigger_pct: 50, billing_pct: 40, pb_number: 'PB2' },
      { id: 'm3', label: 'Completion', trigger_pct: 100, billing_pct: 30, pb_number: 'PB3' },
    ],
  } as unknown as Project,
];

const mockInvoices: ProjectInvoice[] = [
  {
    id: 'inv-1',
    project_id: 'p1',
    project_name: 'Ebecor MES',
    project_no: '2026-001',
    invoice_no: 'SI-2026-001',
    invoice_date: '2026-07-01',
    amount: 150000,
    payment_terms_days: 30,
    due_date: '2026-07-31',
    amount_collected: 147000,
    wht_amount: 3000,
    wht_rate_pct: 2,
    wht_2307_status: 'received',
    collection_date: '2026-07-20',
    pb_number: 'PB1',
    bill_to: 'customer',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-20T00:00:00Z',
  },
  {
    id: 'inv-2',
    project_id: 'p1',
    project_name: 'Ebecor MES',
    project_no: '2026-001',
    invoice_no: 'SI-2026-002',
    invoice_date: '2026-08-01',
    amount: 200000,
    payment_terms_days: 30,
    due_date: '2026-08-31',
    amount_collected: 0,
    pb_number: 'PB2',
    bill_to: 'customer',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  },
];

const mockSoas: StatementOfAccount[] = [
  {
    id: 'soa-1',
    soaNo: 'SOA2607001-ACT-00',
    revision: '00',
    date: '2026-07-15',
    currency: 'PHP',
    status: 'settled',
    recipientCode: 'ACT',
    recipientName: 'Advance Controle Technologie Inc',
    recipientContactName: 'Lindsey Salilig',
    recipientAddress: 'Cavite',
    subject: 'Consolidated Billing',
    items: [
      {
        id: 'item-1',
        projectId: 'p1',
        projectNo: '2026-001',
        projectName: 'Ebecor MES',
        description: 'Ebecor unit connectivity',
        amount: 150000,
        hasPo: true,
      },
    ],
    footnotes: [],
    subtotalWithPo: 150000,
    subtotalPendingPo: 0,
    totalOutstanding: 150000,
    preparedByName: 'RJ Rivera',
    preparedByTitle: 'Manager',
    preparedByPhone: '0919',
    preparedByEmail: 'rj@test.com',
    amountCollected: 150000,
    balanceRemaining: 0,
    createdAt: '2026-07-15T00:00:00Z',
    updatedAt: '2026-07-20T00:00:00Z',
  },
];

beforeEach(() => {
  jest.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/projects')) {
      return { ok: true, json: async () => mockProjects } as Response;
    }
    if (urlStr.includes('/api/invoices')) {
      return { ok: true, json: async () => mockInvoices } as Response;
    }
    if (urlStr.includes('/api/soa')) {
      return { ok: true, json: async () => ({ data: mockSoas }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders 3 tabs and displays Receivables tab by default', async () => {
  render(
    <MemoryRouter initialEntries={['/finance/collections']}>
      <CollectionsDashboard />
    </MemoryRouter>,
  );

  expect(await screen.findByText(/Receivables & Billing/i)).toBeInTheDocument();
  expect(screen.getByText(/Collected & Settlement Ledger/i)).toBeInTheDocument();
  expect(screen.getByText(/ACTI Expected Watchlist/i)).toBeInTheDocument();

  // Receivables shows open invoice SI-2026-002
  expect(screen.getByText('SI-2026-002')).toBeInTheDocument();
});

test('navigating to tab=settled renders Collected & Settlement Ledger with deep links and metrics', async () => {
  render(
    <MemoryRouter initialEntries={['/finance/collections?tab=settled']}>
      <CollectionsDashboard />
    </MemoryRouter>,
  );

  expect(await screen.findByText(/Collected & Settlement History/i)).toBeInTheDocument();
  expect(screen.getByText(/Total Cash Inflow/i)).toBeInTheDocument();
  expect(screen.getByText(/BIR 2307 EWT Recognized/i)).toBeInTheDocument();

  // Shows settled invoice SI-2026-001 with PB milestone PB1 and linked SOA
  expect(screen.getByText('SI-2026-001')).toBeInTheDocument();
  expect(screen.getByText('PB1')).toBeInTheDocument();
  expect(screen.getByText('SOA2607001-ACT-00')).toBeInTheDocument();
  expect(screen.getByText('2307 on file')).toBeInTheDocument();
});

test('switching tabs via click switches from Receivables to Collected Ledger', async () => {
  render(
    <MemoryRouter initialEntries={['/finance/collections']}>
      <CollectionsDashboard />
    </MemoryRouter>,
  );

  expect(await screen.findByText('SI-2026-002')).toBeInTheDocument();

  // Click on Collected & Settlement Ledger tab
  fireEvent.click(screen.getByRole('tab', { name: /Collected & Settlement Ledger/i }));

  expect(await screen.findByText(/Collected & Settlement History/i)).toBeInTheDocument();
  expect(screen.getByText('SI-2026-001')).toBeInTheDocument();
  expect(screen.getByText('SOA2607001-ACT-00')).toBeInTheDocument();
});
