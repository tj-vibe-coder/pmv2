import type { FinanceTraceOrigin } from '../types/FinanceTrace';

interface InvestmentLinkFields {
  id: string;
  sourceExpenseId?: string;
  sourceCollection?: 'project_expenses' | 'overhead_expenses' | 'cash_advances';
  linkedExpenseId?: string;
  linkedExpenseCollection?: 'project_expenses' | 'overhead_expenses' | 'cash_advances';
}

export const linkedOriginForInvestment = (
  investment: InvestmentLinkFields,
): FinanceTraceOrigin | null => {
  const id = investment.sourceExpenseId || investment.linkedExpenseId;
  const collection = investment.sourceCollection || investment.linkedExpenseCollection;
  if (!id || !collection) return null;
  if (collection === 'cash_advances') return { type: 'cash_advance', id };
  return { type: 'expense', collection, id };
};
