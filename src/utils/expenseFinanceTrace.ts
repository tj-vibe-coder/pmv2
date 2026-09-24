import type { FinanceTraceOrigin } from '../types/FinanceTrace';

interface ExpenseTraceFields {
  id: string;
  scope: 'project' | 'overhead';
  fundingSource?: { type?: string; linkedInvestmentId?: string } | null;
  sourceType?: string;
  sourceLiquidationId?: string;
  sourceLiquidationRowId?: string;
  sourceCaId?: string;
}

export const expenseOrigin = (expense: ExpenseTraceFields): FinanceTraceOrigin => ({
  type: 'expense',
  collection: expense.scope === 'project' ? 'project_expenses' : 'overhead_expenses',
  id: expense.id,
});

export const linkedOriginsForExpense = (
  expense: ExpenseTraceFields,
): FinanceTraceOrigin[] => {
  const origins: FinanceTraceOrigin[] = [];
  if (expense.fundingSource?.linkedInvestmentId) {
    origins.push({ type: 'investment', id: expense.fundingSource.linkedInvestmentId });
  }
  if (expense.sourceLiquidationId && expense.sourceLiquidationRowId) {
    origins.push({
      type: 'liquidation',
      id: expense.sourceLiquidationId,
      rowId: expense.sourceLiquidationRowId,
    });
  }
  if (expense.sourceCaId) {
    origins.push({ type: 'cash_advance', id: expense.sourceCaId });
  }
  return origins;
};
