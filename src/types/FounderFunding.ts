export type FounderFundingEntryType =
  | 'founder_advance'
  | 'capital_contribution'
  | 'repayment'
  | 'capitalization'
  | 'opening_balance_adjustment';

export type FounderFundingStatus = 'posted' | 'voided';
export type FounderFundingSourceKind = 'liquidation' | 'cash_deposit' | 'legacy_reconciliation';

export interface FounderFundingSource {
  kind: FounderFundingSourceKind;
  liquidationId?: string;
  liquidationFormNo?: string;
  depositReference?: string;
  reconciliationId?: string;
}

export interface FounderFundingEntry {
  id: string;
  transactionDate: string;
  founderId: string;
  founderName: string;
  entryType: FounderFundingEntryType;
  amountCentavos: number;
  currency: 'PHP';
  description: string;
  source: FounderFundingSource;
  settlesEntryId?: string;
  settledCentavos?: number;
  remainingCentavos?: number;
  resolutionReference?: string;
  proofRefs: string[];
  status: FounderFundingStatus;
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

export interface FounderFundingFounder {
  id: string;
  name: string;
}

export interface FounderFundingSummary {
  advancesOutstandingCentavos: number;
  capitalContributedCentavos: number;
  repaidThisPeriodCentavos: number;
  needsReviewCount: number;
  perFounder?: Record<string, Omit<FounderFundingSummary, 'perFounder' | 'needsReviewCount'>>;
}

export interface FounderFundingLedgerResponse {
  success: boolean;
  entries: FounderFundingEntry[];
  summary: FounderFundingSummary;
  founders?: FounderFundingFounder[];
  error?: string;
}

export interface FounderFundingSettingsResponse {
  success: boolean;
  settings: {
    founderUserIds: string[];
    capitalTargetCentavos?: number;
    founders?: Array<{ id: string; username?: string; fullName?: string | null }>;
  };
  error?: string;
}

export interface ReconciliationCandidate {
  id: string;
  founderId?: string;
  founderName?: string;
  liquidationId: string;
  liquidationFormNo?: string;
  sourceLabel: string;
  transactionDate?: string;
  description: string;
  reviewAmountCentavos: number;
  liquidationAmountCentavos: number | null;
  legacyAmountCentavos?: number | null;
  amountDifferenceCentavos?: number;
  confidence?: number;
  manualExpenseIds: string[];
  legacyInvestmentIds: string[];
  proposedAction?: string;
  evidence?: string[];
  status?: 'needs_review' | 'approved' | 'applied' | 'dismissed';
}

export interface FounderFundingReconciliationResponse {
  success: boolean;
  candidates: ReconciliationCandidate[];
  error?: string;
}

export interface FounderDepositPayload {
  idempotencyKey: string;
  founderId: string;
  entryType: 'founder_advance' | 'capital_contribution';
  amount: string;
  transactionDate: string;
  description: string;
  depositReference: string;
  resolutionReference?: string;
  proofRefs: string[];
}

export interface FounderSettlementPayload {
  idempotencyKey: string;
  amount: string;
  transactionDate: string;
  description?: string;
  resolutionReference?: string;
  proofRefs: string[];
}

export interface FounderFundingMutationResponse {
  success: boolean;
  entry?: FounderFundingEntry;
  error?: string;
  message?: string;
}
