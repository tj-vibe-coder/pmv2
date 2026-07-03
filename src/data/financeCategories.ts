// Direct project costs (Cost of Services / COGS) — shown on the per-project Expense Monitoring surface.
export const PROJECT_EXPENSE_CATEGORIES = [
  '3rd Party Labor',
  'Materials',
  'Transportation',
  'Accommodation',
  'Airfare',
  'Gas',
  'Tools / Direct',
  'Meals',
  'Others',
] as const;

// Company-wide operating expenses (OPEX) — shown on the Overhead Expenses surface.
export const OVERHEAD_CATEGORIES = [
  'Entertainment',
  'Rent',
  'Salaries & Wages',
  'Supplies',
  'Communication & Utilities',
  'Advertising/Marketing',
  'Repairs & Maintenance',
  'Government Contributions',
  'Others',
] as const;

export const INVOICE_TYPES = [
  'Sales Invoice',
  'Service Invoice',
  'Official Receipt',
  'Other',
] as const;

export type ExpenseCategoryType =
  | typeof PROJECT_EXPENSE_CATEGORIES[number]
  | typeof OVERHEAD_CATEGORIES[number];

// Back-compat union (deduped) for generic surfaces (e.g. ScanPage) and normalization.
export const EXPENSE_CATEGORIES: ExpenseCategoryType[] = Array.from(
  new Set<ExpenseCategoryType>([...PROJECT_EXPENSE_CATEGORIES, ...OVERHEAD_CATEGORIES])
);

// --- Chart of Accounts (Philippine AFS numbering: 3xxx equity, 4xxx revenue, 5xxx cost of services, 6xxx operating expenses) ---
export type AccountType = 'revenue' | 'cost_of_services' | 'operating_expense' | 'equity';

export const ACCOUNT_MAP: Record<string, { code: string; type: AccountType }> = {
  // Revenue (4xxx)
  'Service Revenue': { code: '4000', type: 'revenue' },

  // Cost of Services / direct project costs (5xxx)
  '3rd Party Labor': { code: '5001', type: 'cost_of_services' },
  'Materials': { code: '5002', type: 'cost_of_services' },
  'Transportation': { code: '5003', type: 'cost_of_services' },
  'Accommodation': { code: '5004', type: 'cost_of_services' },
  'Airfare': { code: '5005', type: 'cost_of_services' },
  'Gas': { code: '5006', type: 'cost_of_services' },
  'Tools / Direct': { code: '5007', type: 'cost_of_services' },
  'Meals': { code: '5008', type: 'cost_of_services' },

  // Operating expenses / overhead (6xxx)
  'Entertainment': { code: '6001', type: 'operating_expense' },
  'Rent': { code: '6002', type: 'operating_expense' },
  'Salaries & Wages': { code: '6003', type: 'operating_expense' },
  'Supplies': { code: '6004', type: 'operating_expense' },
  'Communication & Utilities': { code: '6005', type: 'operating_expense' },
  'Advertising/Marketing': { code: '6006', type: 'operating_expense' },
  'Repairs & Maintenance': { code: '6007', type: 'operating_expense' },
  'Government Contributions': { code: '6010', type: 'operating_expense' },
  'Others': { code: '6900', type: 'operating_expense' },

  // Equity (3xxx)
  'Owner Capital': { code: '3000', type: 'equity' },
};

/**
 * Account details for a category. `context` disambiguates categories that exist on
 * both surfaces (notably 'Others') and chooses the right catch-all for unknown
 * categories: 'project' → Cost of Services (5xxx), 'overhead'/undefined → Operating Expenses (6xxx).
 */
export function accountFor(
  category: string,
  context?: 'project' | 'overhead',
): { code: string; type: AccountType } {
  if (context === 'project' && (category === 'Others' || !ACCOUNT_MAP[category])) {
    return { code: '5009', type: 'cost_of_services' };
  }
  return ACCOUNT_MAP[category] || { code: '6900', type: 'operating_expense' };
}

export const LIQUIDATION_CATEGORIES = [
  'Tools / Direct',
  'Gas',
  'Materials',
  'Transportation',
  'Accommodation',
  '3rd Party Labor',
  'Rent',
  'Salaries & Wages',
  'Supplies',
  'Communication & Utilities',
  'Meals',
  'Advertising/Marketing',
  'Repairs & Maintenance',
  'Others',
] as const;

export type LiquidationCategoryType = typeof LIQUIDATION_CATEGORIES[number];

export const INVESTMENT_CATEGORIES = [
  'Capital Contribution',
  'Project Expense',
  'Startup Expense',
  'Overhead',
  'Cash Advance',
  'Liquidation',
  'Flight',
] as const;

export type InvestmentCategoryType = typeof INVESTMENT_CATEGORIES[number];

export const INVESTORS = [
  'TJ Caballero',
  'RJ Rivera',
  'Renzel Punongbayan',
  'Nylle Harold Managa',
] as const;

export type InvestorType = typeof INVESTORS[number];

// Marks an expense as paid directly by an investor out of pocket (rather than
// from the corporate bank account) so it can be auto-linked to a matching
// `investments` row server-side instead of being re-entered by hand.
export interface FundingSource {
  type: 'corporate_bank' | 'investor_outofpocket';
  /** Optional: draw against an EXISTING investments row (e.g. a lump-sum capital
   * contribution) instead of auto-creating a new one-off row for this expense. */
  linkedInvestmentId?: string;
  investor?: string;
}

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
