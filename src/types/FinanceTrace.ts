export type FinanceTraceNodeType =
  | 'investment'
  | 'expense'
  | 'liquidation'
  | 'cash_advance'
  | 'reimbursement';

export type FinanceExpenseCollection =
  | 'project_expenses'
  | 'overhead_expenses';

export type FinanceTraceRelation =
  | 'funded_by'
  | 'recorded_as_expense'
  | 'liquidated_by'
  | 'funded_by_cash_advance'
  | 'reimbursed_by';

export type FinanceTraceOrigin =
  | { type: 'investment'; id: string }
  | { type: 'expense'; collection: FinanceExpenseCollection; id: string }
  | { type: 'liquidation'; id: string; rowId: string }
  | { type: 'cash_advance'; id: string }
  | { type: 'reimbursement'; id: string };

export interface FinanceTraceNode {
  key: string;
  type: FinanceTraceNodeType;
  id: string;
  rowId?: string;
  collection: string;
  label: string;
  secondaryLabel?: string;
  date?: string;
  amount?: number;
  status?: string;
  projectId?: string;
  projectName?: string;
  sourceType?: string;
  focusUrl: string;
}

export interface FinanceTraceEdge {
  from: string;
  to: string;
  relation: FinanceTraceRelation;
  confirmed: true;
}

export interface FinanceTraceCandidate {
  node: FinanceTraceNode;
  proposedRelation: FinanceTraceRelation;
  score: number;
  evidence: string[];
  needsReview: boolean;
  confirmable: boolean;
}

export interface FinanceTracePermissions {
  canConfirm: boolean;
  canResolve: boolean;
}

export interface FinanceTraceResponse {
  originKey: string;
  nodes: FinanceTraceNode[];
  edges: FinanceTraceEdge[];
  candidates: FinanceTraceCandidate[];
  permissions: FinanceTracePermissions;
}

interface FinanceTraceResolutionBase {
  investmentId: string;
  expenseId: string;
  expenseCollection: FinanceExpenseCollection;
  reason: string;
  expectedInvestmentUpdatedAt?: string | number | null;
  expectedExpenseUpdatedAt?: string | number | null;
}

export interface ConfirmFinanceTraceMatch extends FinanceTraceResolutionBase {
  action: 'confirm_match';
}

export interface KeepFinanceRecordsSeparate extends FinanceTraceResolutionBase {
  action: 'keep_both_separate';
}

export interface KeepInvestmentDeleteExpense extends FinanceTraceResolutionBase {
  action: 'keep_investment_delete_expense';
  investmentCategory?: string;
}

export interface KeepExpenseDeleteInvestment extends FinanceTraceResolutionBase {
  action: 'keep_expense_delete_investment';
}

export type FinanceTraceResolutionRequest =
  | ConfirmFinanceTraceMatch
  | KeepFinanceRecordsSeparate
  | KeepInvestmentDeleteExpense
  | KeepExpenseDeleteInvestment;

export interface FinanceTraceResolutionResponse {
  success: true;
  message: string;
  trace: FinanceTraceResponse;
}
