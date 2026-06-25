export const EXPENSE_CATEGORIES = [
  '3rd Party Labor',
  'Materials',
  'Transportation',
  'Accommodation',
  'Entertainment',
  'Airfare',
  'Gas',
  'Tools / Direct',
  'Others',
] as const;

export type ExpenseCategoryType = typeof EXPENSE_CATEGORIES[number];

export const LIQUIDATION_CATEGORIES = [
  'Tools / Direct',
  'Gas',
  'Materials',
  'Transportation',
  'Accommodation',
  '3rd Party Labor',
  'Others',
] as const;

export type LiquidationCategoryType = typeof LIQUIDATION_CATEGORIES[number];

export const INVESTMENT_CATEGORIES = [
  'Capital Contribution',
  'Project Expense',
  'Startup Expense',
  'Overhead',
  'Liquidation',
  'Flight',
] as const;

export type InvestmentCategoryType = typeof INVESTMENT_CATEGORIES[number];

const CATEGORY_ALIAS_MAP: Record<string, string> = {
  'Accomodation': 'Accommodation',
  'accomodation': 'Accommodation',
  'accommodation': 'Accommodation',
  '3rd party labor': '3rd Party Labor',
  'tools / direct': 'Tools / Direct',
  'tools/direct': 'Tools / Direct',
};

export function normalizeExpenseCategory(raw: string): string {
  if (!raw) return 'Others';
  return CATEGORY_ALIAS_MAP[raw.trim()] ?? raw.trim();
}
