import { linkedOriginForInvestment } from './investmentFinanceTrace';

const base = {
  id: 'i1', date: '2026-01-01', investor: 'TJ', amount: 100,
  category: 'Overhead', description: 'Microsoft',
};

test('maps project and overhead links to exact expense origins', () => {
  expect(linkedOriginForInvestment({
    ...base, sourceExpenseId: 'p1', sourceCollection: 'project_expenses' as const,
  })).toEqual({ type: 'expense', collection: 'project_expenses', id: 'p1' });
  expect(linkedOriginForInvestment({
    ...base, linkedExpenseId: 'o1', linkedExpenseCollection: 'overhead_expenses' as const,
  })).toEqual({ type: 'expense', collection: 'overhead_expenses', id: 'o1' });
});

test('maps linked cash advances to exact cash-advance origins', () => {
  expect(linkedOriginForInvestment({
    ...base, sourceExpenseId: 'ca1', sourceCollection: 'cash_advances' as const,
  })).toEqual({ type: 'cash_advance', id: 'ca1' });
});

test('returns null when an investment has no complete link', () => {
  expect(linkedOriginForInvestment(base)).toBeNull();
  expect(linkedOriginForInvestment({
    ...base, sourceCollection: 'project_expenses' as const,
  })).toBeNull();
});
