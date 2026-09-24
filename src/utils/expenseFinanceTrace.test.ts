import {
  expenseOrigin,
  linkedOriginsForExpense,
} from './expenseFinanceTrace';

const projectExpense = {
  id: 'e1', scope: 'project' as const, description: 'X-Ray', amount: 4000,
  date: '2026-02-27', category: 'Medical', createdAt: '2026-02-27',
};

test('maps expense scopes to Firestore-aware origins', () => {
  expect(expenseOrigin(projectExpense)).toEqual({
    type: 'expense', collection: 'project_expenses', id: 'e1',
  });
  expect(expenseOrigin({ ...projectExpense, scope: 'overhead' as const })).toEqual({
    type: 'expense', collection: 'overhead_expenses', id: 'e1',
  });
});

test('returns exact investment, liquidation-row, and cash-advance links', () => {
  expect(linkedOriginsForExpense({
    ...projectExpense,
    fundingSource: { type: 'investor_outofpocket' as const, linkedInvestmentId: 'i1' },
    sourceLiquidationId: 'l1', sourceLiquidationRowId: 'r1', sourceCaId: 'ca1',
  })).toEqual([
    { type: 'investment', id: 'i1' },
    { type: 'liquidation', id: 'l1', rowId: 'r1' },
    { type: 'cash_advance', id: 'ca1' },
  ]);
});

test('does not invent links from labels alone', () => {
  expect(linkedOriginsForExpense({ ...projectExpense, sourceType: 'liquidation_sync' }))
    .toEqual([]);
});
