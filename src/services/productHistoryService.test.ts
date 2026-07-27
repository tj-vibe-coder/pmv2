jest.mock('../config/api', () => ({
  API_BASE: 'http://lan-host:3001',
}));

import {
  fetchProductHistory,
  fetchProductHistorySuggestion,
} from './productHistoryService';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.setItem('netpacific_token', 'token');
});

it('encodes search filters and includes authentication', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, items: [], total: 0, limit: 50 }),
  });

  await fetchProductHistory({
    search: 'ABB S203',
    status: 'lost',
    sort: 'newest',
  });

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining(
      'http://lan-host:3001/api/calcsheet/product-history'
      + '?search=ABB+S203&status=lost&sort=newest',
    ),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }),
  );
});

it('posts explicit suggestion dates and selected observation', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      status: 'ready',
      method: 'quarterly',
      confidence: 'medium',
      suggestedContingencyPct: 13,
      included: [],
      excluded: [],
    }),
  });

  await fetchProductHistorySuggestion({
    selectedObservationId: 'q1:c1',
    analysisDate: '2026-01-01',
    expectedPurchaseDate: '2026-04-01',
  });

  expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      selectedObservationId: 'q1:c1',
      analysisDate: '2026-01-01',
      expectedPurchaseDate: '2026-04-01',
    }),
  }));
});

it('surfaces the server error message', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    statusText: 'Bad Request',
    json: async () => ({
      error: 'Expected purchase date cannot be before the quotation date',
    }),
  });

  await expect(fetchProductHistorySuggestion({
    selectedObservationId: 'q1:c1',
    analysisDate: '2026-01-01',
    expectedPurchaseDate: '2025-12-01',
  })).rejects.toThrow(
    'Expected purchase date cannot be before the quotation date',
  );
});
