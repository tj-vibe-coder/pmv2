import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FinanceTraceApiError, resolveFinanceTrace } from '../../services/financeTraceService';
import type { FinanceTraceCandidate, FinanceTraceNode } from '../../types/FinanceTrace';
import FinanceTraceResolveDialog from './FinanceTraceResolveDialog';

jest.mock('../../services/financeTraceService', () => {
  class MockFinanceTraceApiError extends Error {
    status: number;
    code: string;
    sourceFocusUrl?: string;
    constructor(options: any) {
      super(options.message);
      this.status = options.status;
      this.code = options.code;
      this.sourceFocusUrl = options.sourceFocusUrl;
    }
  }
  return { resolveFinanceTrace: jest.fn(), FinanceTraceApiError: MockFinanceTraceApiError };
});

const resolveMock = resolveFinanceTrace as jest.MockedFunction<typeof resolveFinanceTrace>;
const investment: FinanceTraceNode = {
  key: 'investment:i1', type: 'investment', id: 'i1', collection: 'investments',
  label: 'Medical for manpower', focusUrl: '/finance/investment-tracker?focus=investment%3Ai1',
};
const candidate: FinanceTraceCandidate = {
  node: {
    key: 'expense:project_expenses:e1', type: 'expense', id: 'e1',
    collection: 'project_expenses', label: 'Medical X-Ray',
    focusUrl: '/finance/expense-monitoring?focus=expense%3Aproject_expenses%3Ae1',
  },
  proposedRelation: 'recorded_as_expense', score: 90,
  evidence: ['same amount', 'same project'], needsReview: true, confirmable: true,
};

beforeEach(() => {
  jest.setTimeout(15000);
  resolveMock.mockReset();
});

function renderDialog(onResolved = jest.fn()) {
  render(
    <MemoryRouter>
      <FinanceTraceResolveDialog
        open
        anchorNode={investment}
        candidate={candidate}
        onClose={jest.fn()}
        onResolved={onResolved}
      />
    </MemoryRouter>,
  );
  return onResolved;
}

function renderConfirmedDialog() {
  render(
    <MemoryRouter>
      <FinanceTraceResolveDialog
        open
        anchorNode={investment}
        candidate={{
          ...candidate,
          evidence: ['confirmed investment-expense link'],
          needsReview: false,
        }}
        onClose={jest.fn()}
        onResolved={jest.fn()}
      />
    </MemoryRouter>,
  );
}

test('offers confirm plus all three approved resolution outcomes', () => {
  renderDialog();
  expect(screen.getByRole('radio', { name: /Confirm match/i })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Keep both.*separate/i })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Keep investment.*delete expense/i })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Keep expense.*delete investment/i })).toBeInTheDocument();
});

test('an existing link starts with unlink and never offers duplicate confirmation', () => {
  renderConfirmedDialog();
  expect(screen.getByRole('heading', { name: 'Review confirmed link' })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: /Confirm match/i })).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Keep both.*separate/i })).toBeChecked();
});

test('requires a reason and explicit deletion confirmation', async () => {
  renderDialog();
  fireEvent.click(screen.getByRole('radio', { name: /Keep investment.*delete expense/i }));
  expect(screen.getByRole('button', { name: 'Apply resolution' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Review reason/), { target: { value: 'Duplicate itemized elsewhere' } });
  expect(screen.getByRole('button', { name: 'Apply resolution' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /I understand this deletes/i }));
  expect(screen.getByRole('button', { name: 'Apply resolution' })).toBeEnabled();
});

test('submits investment reclassification and reports the refreshed trace', async () => {
  const onResolved = renderDialog();
  const response: any = { success: true, message: 'Resolved', trace: { originKey: 'investment:i1' } };
  resolveMock.mockResolvedValue(response);
  fireEvent.click(screen.getByRole('radio', { name: /Keep investment.*delete expense/i }));
  fireEvent.change(screen.getByLabelText('Investment category (optional)'), { target: { value: 'Capital Contribution' } });
  fireEvent.change(screen.getByLabelText(/Review reason/), { target: { value: 'Liquidation already records the expense' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /I understand this deletes/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply resolution' }));
  await waitFor(() => expect(resolveMock).toHaveBeenCalledWith({
    action: 'keep_investment_delete_expense',
    investmentId: 'i1',
    expenseId: 'e1',
    expenseCollection: 'project_expenses',
    reason: 'Liquidation already records the expense',
    investmentCategory: 'Capital Contribution',
  }));
  expect(onResolved).toHaveBeenCalledWith(response);
});

test('turns protected-source errors into an Open source action', async () => {
  renderDialog();
  resolveMock.mockRejectedValue(new FinanceTraceApiError({
    status: 422,
    code: 'SOURCE_OWNED_EXPENSE',
    message: 'Correct this expense at its source',
    sourceFocusUrl: '/finance/expense-monitoring/liquidation-form?focus=liquidation%3Al1%3Ar1',
  }));
  fireEvent.change(screen.getByLabelText(/Review reason/), { target: { value: 'Needs source correction' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply resolution' }));
  expect(await screen.findByText('Correct this expense at its source')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute(
    'href', expect.stringContaining('liquidation-form'),
  );
});

