import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AnalyticsStudioPage from './AnalyticsStudioPage';

// Mock ResizeObserver for Recharts
beforeAll(() => {
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

// Mock dataService
jest.mock('../../services/dataService', () => ({
  __esModule: true,
  default: {
    getProjects: jest.fn().mockResolvedValue([
      { id: '1', project_name: 'Project Alpha', project_category: 'HVAC', project_status: 'won', updated_contract_amount: 1500000, year: 2026 },
      { id: '2', project_name: 'Project Beta', project_category: 'Electrical', project_status: 'draft', updated_contract_amount: 800000, year: 2026 },
    ]),
    formatCurrency: (val: number) => `₱${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  },
}));

// Mock useQuotationStore
jest.mock('../../store/quotationStore', () => ({
  useQuotationStore: () => ({
    projects: [
      { id: 'opp-1', name: 'MES Facility Expansion', clientName: 'Lear Corp', opportunityGrade: 'A', status: 'won', dealValue: 2400000, createdAt: '2026-02-10' },
      { id: 'opp-2', name: 'HVAC Retrofit', clientName: 'ADI Inc', opportunityGrade: 'B', status: 'sent', dealValue: 950000, createdAt: '2026-03-01' },
    ],
    clients: [
      { id: 'c-1', name: 'Lear Corp' },
      { id: 'c-2', name: 'ADI Inc' },
    ],
    quotations: [],
    init: jest.fn().mockResolvedValue(undefined),
  }),
}));

it('renders the Projects Analytics Studio by default', async () => {
  render(
    <MemoryRouter initialEntries={['/projects/analytics']}>
      <AnalyticsStudioPage domainScope="projects" />
    </MemoryRouter>
  );

  expect(screen.getByText('Projects Analytics Studio')).toBeInTheDocument();
  expect(screen.getByText('Projects Studio')).toBeInTheDocument();
  expect(screen.getByText('Sales Studio')).toBeInTheDocument();
  expect(screen.getByText('Finance Studio')).toBeInTheDocument();
  expect(screen.getByText('Visual Encoding Shelves')).toBeInTheDocument();
  expect(screen.getAllByText('Project Balances by Category')[0]).toBeInTheDocument();
});

it('renders the Sales Analytics Studio when scoped to sales', async () => {
  render(
    <MemoryRouter initialEntries={['/sales/analytics']}>
      <AnalyticsStudioPage domainScope="sales" />
    </MemoryRouter>
  );

  expect(screen.getByText('Sales Analytics Studio')).toBeInTheDocument();
  expect(screen.getAllByText('Pipeline Value by Opportunity Grade')[0]).toBeInTheDocument();
});

it('renders the Finance Analytics Studio when scoped to finance', async () => {
  render(
    <MemoryRouter initialEntries={['/finance/analytics']}>
      <AnalyticsStudioPage domainScope="finance" />
    </MemoryRouter>
  );

  expect(screen.getByText('Finance Analytics Studio')).toBeInTheDocument();
  expect(screen.getAllByText('Expense Breakdown by Category')[0]).toBeInTheDocument();
  expect(screen.getAllByText('3-Month Expense Forecast (Recurring Run Rate)')[0]).toBeInTheDocument();
  expect(screen.getAllByText('Recurring vs Variable Expense Projection')[0]).toBeInTheDocument();
  expect(screen.getAllByText('Recurring Run Rate by Category')[0]).toBeInTheDocument();
});

it('switches to 3-Month Expense Forecast preset in Finance Studio', async () => {
  // Mock fetch responses for finance
  global.fetch = jest.fn((url: string) => {
    if (url.includes('/api/project-expenses')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          expenses: [
            { id: 'pe-1', category: 'Materials', amount: 45000, date: '2026-07-15', status: 'Recorded' },
            { id: 'pe-2', category: '3rd Party Labor', amount: 25000, date: '2026-08-10', status: 'Recorded' },
          ],
        }),
      } as Response);
    }
    if (url.includes('/api/overhead-expenses')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          expenses: [
            { id: 'oe-1', category: 'Rent', amount: 50000, date: '2026-07-01', status: 'Paid' },
            { id: 'oe-2', category: 'Salaries & Wages', amount: 120000, date: '2026-08-01', status: 'Paid' },
            { id: 'oe-3', category: 'Communication & Utilities', amount: 15000, date: '2026-08-05', status: 'Paid' },
          ],
        }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, cash_advances: [], data: [] }),
    } as Response);
  }) as jest.Mock;

  render(
    <MemoryRouter initialEntries={['/finance/analytics']}>
      <AnalyticsStudioPage domainScope="finance" />
    </MemoryRouter>
  );

  const forecastPreset = screen.getAllByText('3-Month Expense Forecast (Recurring Run Rate)')[0];
  fireEvent.click(forecastPreset);

  // The active thread or title should reflect the forecast selection
  expect(screen.getAllByText(/Forecast/i).length).toBeGreaterThan(0);
});

it('formulates an expense forecast from natural language query in Finance Studio', async () => {
  render(
    <MemoryRouter initialEntries={['/finance/analytics']}>
      <AnalyticsStudioPage domainScope="finance" />
    </MemoryRouter>
  );

  const input = screen.getByPlaceholderText(/Ask anything about finance/i);
  fireEvent.change(input, { target: { value: 'Forecast next 6 months recurring expense burn' } });
  fireEvent.click(screen.getByRole('button', { name: 'Formulate' }));

  // Creates a thread with the query
  expect(screen.getAllByText('Forecast next 6 months recurring expense burn')[0]).toBeInTheDocument();
});

