import type {
  FinanceExpenseCollection,
  FinanceTraceOrigin,
} from '../types/FinanceTrace';

const EXPENSE_COLLECTIONS = new Set<FinanceExpenseCollection>([
  'project_expenses',
  'overhead_expenses',
]);

const encodeSegment = (value: string): string => encodeURIComponent(value);

const decodeSegment = (value: string): string | null => {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
};

export const financeFocusToken = (origin: FinanceTraceOrigin): string => {
  switch (origin.type) {
    case 'investment':
    case 'cash_advance':
    case 'reimbursement':
      return `${origin.type}:${encodeSegment(origin.id)}`;
    case 'expense':
      return `expense:${origin.collection}:${encodeSegment(origin.id)}`;
    case 'liquidation':
      return `liquidation:${encodeSegment(origin.id)}:${encodeSegment(origin.rowId)}`;
  }
};

export const parseFinanceFocus = (token: string | null | undefined): FinanceTraceOrigin | null => {
  if (!token) return null;
  const parts = token.split(':');
  const type = parts[0];

  if (type === 'expense' && parts.length === 3) {
    const collection = parts[1] as FinanceExpenseCollection;
    const id = decodeSegment(parts[2]);
    if (!EXPENSE_COLLECTIONS.has(collection) || !id) return null;
    return { type, collection, id };
  }

  if (type === 'liquidation' && parts.length === 3) {
    const id = decodeSegment(parts[1]);
    const rowId = decodeSegment(parts[2]);
    return id && rowId ? { type, id, rowId } : null;
  }

  if (
    (type === 'investment' || type === 'cash_advance' || type === 'reimbursement')
    && parts.length === 2
  ) {
    const id = decodeSegment(parts[1]);
    return id ? { type, id } : null;
  }

  return null;
};

const routeForOrigin = (origin: FinanceTraceOrigin): string => {
  switch (origin.type) {
    case 'investment':
      return '/finance/investment-tracker';
    case 'expense':
      return '/finance/expense-monitoring';
    case 'liquidation':
      return '/finance/expense-monitoring/liquidation-form';
    case 'cash_advance':
      return '/finance/expense-monitoring/ca-form';
    case 'reimbursement':
      return '/finance/reimbursements';
  }
};

export const financeFocusUrl = (
  origin: FinanceTraceOrigin,
  from?: string,
): string => {
  const params = new URLSearchParams({ focus: financeFocusToken(origin) });
  if (from) params.set('from', from);
  return `${routeForOrigin(origin)}?${params.toString()}`;
};
