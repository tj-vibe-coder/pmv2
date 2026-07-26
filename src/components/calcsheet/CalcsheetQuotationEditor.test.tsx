import { fireEvent, render, screen } from '@testing-library/react';
import {
  createHistoricalComponentLine,
  HistoricalSourceChip,
  resolveExpectedPurchaseDate,
} from './CalcsheetQuotationEditor';
import type { ProductHistoryAddSelection } from '../../types/ProductHistory';

const baseSelection: ProductHistoryAddSelection = {
  observation: {
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
  },
  suggestion: {
    success: true,
    status: 'ready',
    method: 'quarterly',
    confidence: 'medium',
    suggestedContingencyPct: 13,
    included: [],
    excluded: [],
  },
  applySuggestion: false,
};

it('keeps the global product contingency when adding history without Apply', () => {
  const line = createHistoricalComponentLine(
    baseSelection,
    5,
    'B-0020',
    'line-2',
    '2026-01-02T03:04:05.000Z',
  );

  expect(line.contingencyPct).toBe(5);
  expect(line.contingencyPctOverridden).toBe(false);
  expect(line.historicalPriceSource).toEqual(expect.objectContaining({
    observationId: 'q1:c1',
    quotationId: 'q1',
    quotationReference: 'PCS2601001-ABC-01',
    selectedAt: '2026-01-02T03:04:05.000Z',
  }));
  expect(line.historicalPriceSource).not.toHaveProperty('suggestedContingencyPct');
});

it('persists Apply, purchase-date override, and suggestion source evidence', () => {
  const selection: ProductHistoryAddSelection = {
    ...baseSelection,
    applySuggestion: true,
    expectedPurchaseDateOverride: '2026-07-01',
  };

  const line = createHistoricalComponentLine(
    selection,
    5,
    'B-0020',
    'line-2',
    '2026-01-02T03:04:05.000Z',
  );

  expect(line).toEqual(expect.objectContaining({
    expectedPurchaseDate: '2026-07-01',
    contingencyPct: 13,
    contingencyPctOverridden: true,
  }));
  expect(line.historicalPriceSource).toEqual(expect.objectContaining({
    normalizedUnitCost: 10000,
    quotedSellingUnit: 13560,
    suggestedContingencyPct: 13,
    suggestionMethod: 'quarterly',
    suggestionConfidence: 'medium',
  }));
});

it('uses the quotation purchase date or a calendar-safe three-month fallback', () => {
  expect(resolveExpectedPurchaseDate('2026-01-31', '2026-06-15')).toBe('2026-06-15');
  expect(resolveExpectedPurchaseDate('2026-01-31')).toBe('2026-04-30');
  expect(resolveExpectedPurchaseDate('2024-11-30')).toBe('2025-02-28');
});

it('defensively rejects unusable normalized historical costs', () => {
  const invalidSelection: ProductHistoryAddSelection = {
    ...baseSelection,
    observation: {
      ...baseSelection.observation,
      normalizedUnitCost: 0,
    },
  };

  expect(() => createHistoricalComponentLine(
    invalidSelection,
    5,
    'B-0020',
    'line-2',
  )).toThrow('usable quotation date and normalized cost');
});

it('renders compact quotation-source evidence for a historical row', async () => {
  const line = createHistoricalComponentLine(
    baseSelection,
    5,
    'B-0020',
    'line-2',
    '2026-01-02T03:04:05.000Z',
  );

  render(<HistoricalSourceChip source={line.historicalPriceSource!} />);
  fireEvent.mouseOver(screen.getByText('Quote history'));

  expect(await screen.findByRole('tooltip')).toHaveTextContent('PCS2601001-ABC-01');
  expect(screen.getByRole('tooltip')).toHaveTextContent('2025-04-01');
  expect(screen.getByRole('tooltip')).toHaveTextContent('PHP 10,000.00');
});
