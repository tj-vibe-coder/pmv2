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
});
