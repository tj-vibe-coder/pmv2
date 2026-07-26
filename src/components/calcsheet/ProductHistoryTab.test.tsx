import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProductHistoryTab from './ProductHistoryTab';
import * as service from '../../services/productHistoryService';
import type {
  ProductHistoryObservation,
  ProductHistorySuggestion,
} from '../../types/ProductHistory';

jest.mock('../../services/productHistoryService');

const mocked = service as jest.Mocked<typeof service>;

const row: ProductHistoryObservation = {
  observationId: 'q1:c1',
  productKey: 's203-c20',
  matchType: 'exact',
  description: 'S203-C20 breaker',
  brand: 'ABB',
  partNo: 'S203-C20',
  uom: 'pc',
  projectId: 'p1',
  projectCode: 'PCS2601001-ABC-00',
  projectName: 'Panel Upgrade',
  projectStatus: 'won',
  quotationId: 'q1',
  quotationKind: 'IOCT',
  quotationRevision: '01',
  quotationReference: 'PCS2601001-ABC-01',
  quotationDate: '2025-04-01',
  quotationDateSource: 'dateSent',
  sourceUnitCost: 10000,
  sourceForex: 1,
  sourceDiscountPct: 0,
  normalizedUnitCost: 10000,
  quotedSellingUnit: 13560,
  sourceContingencyPct: 5,
  sourceMarkupPct: 20,
};

const defaultProps = {
  active: true,
  analysisDate: '2026-01-01',
  expectedPurchaseDate: '2026-04-01',
  defaultContingencyPct: 5,
  onAdd: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mocked.fetchProductHistory.mockResolvedValue({
    success: true,
    items: [row],
    total: 1,
    limit: 50,
  });
  mocked.fetchProductHistorySuggestion.mockResolvedValue({
    success: true,
    status: 'ready',
    method: 'quarterly',
    confidence: 'medium',
    suggestedContingencyPct: 13,
    rate: 0.02,
    forecastDays: 365,
    included: [row],
    excluded: [],
  });
});

it('loads only after the tab becomes active', async () => {
  const { rerender } = render(<ProductHistoryTab {...defaultProps} active={false} />);
  expect(mocked.fetchProductHistory).not.toHaveBeenCalled();

  rerender(<ProductHistoryTab {...defaultProps} active />);

  expect(await screen.findByText('Panel Upgrade')).toBeInTheDocument();
  expect(mocked.fetchProductHistory).toHaveBeenCalledTimes(1);
});

it('shows source evidence and does not apply a suggestion by default', async () => {
  const onAdd = jest.fn();
  render(<ProductHistoryTab {...defaultProps} onAdd={onAdd} />);

  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));

  expect(await screen.findByRole('button', { name: 'Apply 13% suggestion' }))
    .toBeInTheDocument();
  expect(screen.getAllByText('PCS2601001-ABC-01').length).toBeGreaterThan(0);
  expect(screen.getByText('Quarterly')).toBeInTheDocument();
  expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
  expect(screen.getByText('Price trend')).toBeInTheDocument();
  expect(screen.getByText('2.00% quarterly rate')).toBeInTheDocument();
  expect(screen.getByText('365-day forecast interval')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add product to quotation' }));

  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
    observation: row,
    applySuggestion: false,
  }));
});

it('shows complete quotation metadata and suggestion columns in results', async () => {
  render(<ProductHistoryTab {...defaultProps} />);

  expect(await screen.findByText('Panel Upgrade')).toBeInTheDocument();
  expect(screen.getByText('PCS2601001-ABC-00')).toBeInTheDocument();
  expect(screen.getByText('PCS2601001-ABC-01')).toBeInTheDocument();
  expect(screen.getByText('IOCT · Rev 01')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Suggested contingency' }))
    .toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Confidence' })).toBeInTheDocument();
});

it('requires an explicit Apply click', async () => {
  const onAdd = jest.fn();
  render(<ProductHistoryTab {...defaultProps} onAdd={onAdd} />);

  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Apply 13% suggestion' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add product to quotation' }));

  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ applySuggestion: true }));
});

it('shows insufficient history without an Apply button', async () => {
  mocked.fetchProductHistorySuggestion.mockResolvedValue({
    success: true,
    status: 'insufficient_history',
    method: null,
    confidence: null,
    suggestedContingencyPct: null,
    included: [row],
    excluded: [],
  });
  render(<ProductHistoryTab {...defaultProps} />);

  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));

  expect(await screen.findByText('Insufficient history')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
});

it('recalculates when the product purchase date changes', async () => {
  render(<ProductHistoryTab {...defaultProps} />);
  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));

  fireEvent.change(screen.getByLabelText('This product expected purchase date'), {
    target: { value: '2026-07-01' },
  });

  await waitFor(() => expect(mocked.fetchProductHistorySuggestion).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedPurchaseDate: '2026-07-01' }),
  ));
});

it('does not add a product with an expected purchase date before the quotation date', async () => {
  render(<ProductHistoryTab {...defaultProps} />);
  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));

  fireEvent.change(screen.getByLabelText('This product expected purchase date'), {
    target: { value: '2025-12-31' },
  });

  expect(await screen.findByText('Expected purchase date cannot be before the quotation date'))
    .toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add product to quotation' })).toBeDisabled();
});

it('sends only explicitly confirmed description-match candidates', async () => {
  const unmatched = {
    ...row,
    observationId: 'q1:no-part',
    productKey: null,
    partNo: '',
  };
  const candidate = {
    ...unmatched,
    observationId: 'q2:no-part',
    quotationReference: 'PCS2',
    projectName: 'Candidate Panel',
  };
  mocked.fetchProductHistory.mockResolvedValue({
    success: true,
    items: [unmatched, candidate],
    total: 2,
    limit: 50,
  });
  render(<ProductHistoryTab {...defaultProps} />);

  fireEvent.click((await screen.findAllByRole(
    'button',
    { name: /select s203-c20 breaker/i },
  ))[0]);
  fireEvent.click(await screen.findByLabelText(/PCS2/));

  await waitFor(() => expect(mocked.fetchProductHistorySuggestion).toHaveBeenLastCalledWith(
    expect.objectContaining({ confirmedCandidateObservationIds: ['q2:no-part'] }),
  ));
});

it('debounces search and sends status and sort filters', async () => {
  render(<ProductHistoryTab {...defaultProps} />);
  await screen.findByText('Panel Upgrade');
  mocked.fetchProductHistory.mockClear();

  fireEvent.change(screen.getByLabelText('Search quotation history'), {
    target: { value: 'breaker' },
  });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Project status' }));
  fireEvent.click(screen.getByRole('option', { name: 'Won' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Sort results' }));
  fireEvent.click(screen.getByRole('option', { name: 'Cost: high to low' }));

  await waitFor(() => expect(mocked.fetchProductHistory).toHaveBeenLastCalledWith({
    search: 'breaker',
    status: 'won',
    sort: 'price_desc',
    limit: 50,
  }), { timeout: 1000 });
});

it('keeps a retryable search error inside the tab', async () => {
  mocked.fetchProductHistory.mockRejectedValueOnce(
    new Error('Failed to load quotation history'),
  );
  render(<ProductHistoryTab {...defaultProps} />);

  expect(await screen.findByText('Failed to load quotation history')).toBeInTheDocument();
  mocked.fetchProductHistory.mockResolvedValue({
    success: true,
    items: [row],
    total: 1,
    limit: 50,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(await screen.findByText('Panel Upgrade')).toBeInTheDocument();
});

it('keeps suggestion failures scoped and retryable without blocking Add', async () => {
  mocked.fetchProductHistorySuggestion.mockRejectedValueOnce(
    new Error('Suggestion service unavailable'),
  );
  const onAdd = jest.fn();
  render(<ProductHistoryTab {...defaultProps} onAdd={onAdd} />);

  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));
  expect(await screen.findByText('Suggestion service unavailable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add product to quotation' }));
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
    suggestion: null,
    applySuggestion: false,
  }));

  fireEvent.click(screen.getByRole('button', { name: 'Retry suggestion' }));
  expect(await screen.findByText(/suggested contingency/i)).toBeInTheDocument();
});

it('shows fallback-date and high-risk evidence before application', async () => {
  const fallbackRow = {
    ...row,
    quotationDateSource: 'createdAt' as const,
  };
  mocked.fetchProductHistory.mockResolvedValue({
    success: true,
    items: [fallbackRow],
    total: 1,
    limit: 50,
  });
  mocked.fetchProductHistorySuggestion.mockResolvedValue({
    success: true,
    status: 'ready',
    method: 'annualized',
    confidence: 'low',
    suggestedContingencyPct: 55,
    highRisk: true,
    included: [fallbackRow],
    excluded: [],
  });
  render(<ProductHistoryTab {...defaultProps} />);

  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));

  expect(await screen.findByText('Fallback date')).toBeInTheDocument();
  expect(await screen.findByText(/high-risk suggestion/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply 55% suggestion' })).toBeInTheDocument();
});

it('does not allow adding an observation without a usable date and normalized cost', async () => {
  mocked.fetchProductHistory.mockResolvedValue({
    success: true,
    items: [{
      ...row,
      quotationDate: null,
      quotationDateSource: 'missing',
      normalizedUnitCost: null,
    }],
    total: 1,
    limit: 50,
  });
  render(<ProductHistoryTab {...defaultProps} />);

  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));

  expect(await screen.findByText('Quarterly')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add product to quotation' })).toBeDisabled();
});

it('ignores an older suggestion response after another product is selected', async () => {
  const secondRow = {
    ...row,
    observationId: 'q2:c2',
    description: 'Second breaker',
    quotationReference: 'PCS2601002-ABC-00',
  };
  mocked.fetchProductHistory.mockResolvedValue({
    success: true,
    items: [row, secondRow],
    total: 2,
    limit: 50,
  });

  let resolveFirst!: (value: ProductHistorySuggestion) => void;
  let resolveSecond!: (value: ProductHistorySuggestion) => void;
  mocked.fetchProductHistorySuggestion
    .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
  render(<ProductHistoryTab {...defaultProps} />);

  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));
  await waitFor(() => expect(mocked.fetchProductHistorySuggestion).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: /select second breaker/i }));
  await waitFor(() => expect(mocked.fetchProductHistorySuggestion).toHaveBeenCalledTimes(2));

  await act(async () => resolveSecond({
    success: true,
    status: 'ready',
    method: 'quarterly',
    confidence: 'high',
    suggestedContingencyPct: 22,
    included: [secondRow],
    excluded: [],
  }));
  expect((await screen.findAllByText('22%')).length).toBeGreaterThan(0);

  await act(async () => resolveFirst({
    success: true,
    status: 'ready',
    method: 'annualized',
    confidence: 'low',
    suggestedContingencyPct: 11,
    included: [row],
    excluded: [],
  }));
  expect(screen.getAllByText('22%').length).toBeGreaterThan(0);
  expect(screen.queryByText('11%')).not.toBeInTheDocument();
});

it('invalidates an in-flight suggestion while inactive and recalculates on return', async () => {
  let resolvePending!: (value: ProductHistorySuggestion) => void;
  mocked.fetchProductHistorySuggestion
    .mockImplementationOnce(() => new Promise((resolve) => { resolvePending = resolve; }))
    .mockResolvedValueOnce({
      success: true,
      status: 'ready',
      method: 'quarterly',
      confidence: 'high',
      suggestedContingencyPct: 22,
      included: [row],
      excluded: [],
    });
  const { rerender } = render(<ProductHistoryTab {...defaultProps} />);

  fireEvent.click(await screen.findByRole('button', { name: /select s203-c20 breaker/i }));
  await waitFor(() => expect(mocked.fetchProductHistorySuggestion).toHaveBeenCalledTimes(1));
  rerender(<ProductHistoryTab {...defaultProps} active={false} />);
  await act(async () => resolvePending({
    success: true,
    status: 'ready',
    method: 'annualized',
    confidence: 'low',
    suggestedContingencyPct: 11,
    included: [row],
    excluded: [],
  }));

  rerender(<ProductHistoryTab {...defaultProps} active />);

  expect((await screen.findAllByText('22%')).length).toBeGreaterThan(0);
  expect(screen.queryByText('11%')).not.toBeInTheDocument();
  expect(mocked.fetchProductHistorySuggestion).toHaveBeenCalledTimes(2);
});
