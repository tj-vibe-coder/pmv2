jest.mock('../config/api', () => ({ API_BASE: 'http://lan-host:3001' }));

import {
  FinanceTraceApiError,
  getFinanceTrace,
  resolveFinanceTrace,
} from './financeTraceService';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const traceResponse = {
  originKey: 'investment:i1',
  nodes: [],
  edges: [],
  candidates: [],
  permissions: { canConfirm: true, canResolve: true },
};

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.setItem('netpacific_token', 'token');
});

test('gets a collection-aware expense trail with bearer authentication', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => traceResponse });
  await getFinanceTrace({
    type: 'expense', collection: 'project_expenses', id: 'expense/one',
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://lan-host:3001/api/finance-trace/expense/expense%2Fone?collection=project_expenses',
    { headers: { Authorization: 'Bearer token' } },
  );
});

test('gets an exact liquidation-row trail', async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => traceResponse });
  await getFinanceTrace({ type: 'liquidation', id: 'liq 1', rowId: 'row/2' });
  expect(fetchMock.mock.calls[0][0]).toBe(
    'http://lan-host:3001/api/finance-trace/liquidation/liq%201?rowId=row%2F2',
  );
});

test('posts the complete resolver payload', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, message: 'Records retained.', trace: traceResponse }),
  });
  const payload = {
    action: 'keep_investment_delete_expense' as const,
    investmentId: 'i1',
    expenseId: 'e1',
    expenseCollection: 'overhead_expenses' as const,
    reason: 'Duplicate review',
    investmentCategory: 'Capital Contribution',
  };
  await resolveFinanceTrace(payload);
  expect(fetchMock).toHaveBeenCalledWith(
    'http://lan-host:3001/api/finance-trace/resolve',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
});

test('preserves structured API errors including source navigation', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 422,
    json: async () => ({
      code: 'SOURCE_OWNED_EXPENSE',
      error: 'Correct this expense at its source',
      sourceFocusUrl: '/finance/expense-monitoring/liquidation-form?focus=x',
    }),
  });
  try {
    await resolveFinanceTrace({
      action: 'keep_investment_delete_expense',
      investmentId: 'i1', expenseId: 'e1', expenseCollection: 'project_expenses',
      reason: 'Duplicate review',
    });
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(FinanceTraceApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'SOURCE_OWNED_EXPENSE',
      message: 'Correct this expense at its source',
      sourceFocusUrl: '/finance/expense-monitoring/liquidation-form?focus=x',
    });
  }
});

test('reports invalid non-JSON responses without losing the HTTP status', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    json: async () => { throw new Error('not json'); },
  });
  await expect(getFinanceTrace({ type: 'investment', id: 'i1' }))
    .rejects.toMatchObject({ status: 503, code: 'HTTP_503' });
});
