import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { getFinanceTrace } from '../../services/financeTraceService';
import type { FinanceTraceResponse } from '../../types/FinanceTrace';
import MoneyTrailDrawer from './MoneyTrailDrawer';

jest.mock('../../services/financeTraceService', () => ({
  getFinanceTrace: jest.fn(),
  resolveFinanceTrace: jest.fn(),
  FinanceTraceApiError: class FinanceTraceApiError extends Error {},
}));

const getTraceMock = getFinanceTrace as jest.MockedFunction<typeof getFinanceTrace>;

const trace: FinanceTraceResponse = {
  originKey: 'investment:i1',
  nodes: [
    {
      key: 'investment:i1', type: 'investment', id: 'i1', collection: 'investments',
      label: 'Microsoft subscription', amount: 494.27, date: '2026-03-14',
      focusUrl: '/finance/investment-tracker?focus=investment%3Ai1',
    },
    {
      key: 'expense:overhead_expenses:e1', type: 'expense', id: 'e1',
      collection: 'overhead_expenses', label: 'MSBILL.INFO SGP', amount: 494.27,
      date: '2026-03-14', focusUrl: '/finance/expense-monitoring?focus=expense%3Aoverhead_expenses%3Ae1',
    },
  ],
  edges: [{
    from: 'investment:i1', to: 'expense:overhead_expenses:e1',
    relation: 'recorded_as_expense', confirmed: true,
  }],
  candidates: [{
    node: {
      key: 'expense:overhead_expenses:e2', type: 'expense', id: 'e2',
      collection: 'overhead_expenses', label: 'Microsoft MS Bill Info', amount: 494.62,
      date: '2026-03-15', focusUrl: '/finance/expense-monitoring?focus=expense%3Aoverhead_expenses%3Ae2',
    },
    proposedRelation: 'recorded_as_expense', score: 89,
    evidence: ['amount within ₱0.35', 'date within 1 day'],
    needsReview: true, confirmable: true,
  }],
  permissions: { canConfirm: true, canResolve: true },
};

beforeEach(() => getTraceMock.mockReset());

function renderDrawer(response = trace) {
  getTraceMock.mockResolvedValue(response);
  return render(
    <MemoryRouter initialEntries={['/finance/investment-tracker?focus=investment%3Ai1']}>
      <MoneyTrailDrawer
        open
        origin={{ type: 'investment', id: 'i1' }}
        onClose={jest.fn()}
      />
    </MemoryRouter>,
  );
}

test('renders confirmed chain, relation, exact links, and clearly separate possible matches', async () => {
  renderDrawer();
  expect(screen.getByRole('heading', { name: 'Money trail' })).toBeInTheDocument();
  expect(await screen.findByText('Microsoft subscription')).toBeInTheDocument();
  expect(screen.getByText('Recorded as expense')).toBeInTheDocument();
  expect(screen.getByText('Possible matches')).toBeInTheDocument();
  expect(screen.getByText('Needs review')).toBeInTheDocument();
  expect(screen.getByText(/amount within ₱0\.35/)).toBeInTheDocument();
  const exactLinks = screen.getAllByRole('link', { name: /Open exact record/i });
  expect(exactLinks[1]).toHaveAttribute(
    'href',
    expect.stringContaining('focus=expense%3Aoverhead_expenses%3Ae1'),
  );
  expect(exactLinks[1]).toHaveAttribute('href', expect.stringContaining('from='));
  expect(screen.getByRole('button', { name: 'Review match' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review or unlink' })).toBeInTheDocument();
});

test('opens the resolver for an existing confirmed investment-expense link', async () => {
  renderDrawer();
  await screen.findByText('Microsoft subscription');
  await userEvent.click(screen.getByRole('button', { name: 'Review or unlink' }));
  expect(screen.getByRole('heading', { name: 'Review confirmed link' })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: /Confirm match/i })).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Keep both.*separate/i })).toBeChecked();
});

test('view-only users can navigate but never see mutation controls', async () => {
  renderDrawer({
    ...trace,
    permissions: { canConfirm: false, canResolve: false },
  });
  expect(await screen.findByText('Needs review')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review match' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review or unlink' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /Open exact record/i }).length).toBeGreaterThan(0);
});

test('shows a retryable error state', async () => {
  getTraceMock.mockRejectedValueOnce(new Error('Network unavailable'));
  getTraceMock.mockResolvedValueOnce(trace);
  render(
    <MemoryRouter>
      <MoneyTrailDrawer open origin={{ type: 'investment', id: 'i1' }} onClose={jest.fn()} />
    </MemoryRouter>,
  );
  expect(await screen.findByText('Network unavailable')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByText('Microsoft subscription')).toBeInTheDocument());
  expect(getTraceMock).toHaveBeenCalledTimes(2);
});

test('renders a useful empty confirmed trail', async () => {
  renderDrawer({ ...trace, nodes: [], edges: [], candidates: [] });
  expect(await screen.findByText('No linked records found.')).toBeInTheDocument();
  expect(screen.getByText('No possible matches found.')).toBeInTheDocument();
});
