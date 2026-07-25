import type { ProjectStatus, QuotationKind } from './Quotation';

export interface ProductHistoryObservation {
  observationId: string;
  productKey: string | null;
  matchType: 'exact' | 'confirmed_candidate' | 'unmatched';
  description: string;
  brand?: string;
  partNo?: string;
  uom?: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectStatus: ProjectStatus;
  quotationId: string;
  quotationKind: QuotationKind;
  quotationRevision: string;
  quotationReference: string;
  quotationDate: string | null;
  quotationDateSource: 'dateSent' | 'createdAt' | 'missing';
  sourceUnitCost: number;
  sourceForex: number;
  sourceDiscountPct: number;
  normalizedUnitCost: number | null;
  quotedSellingUnit: number | null;
  sourceContingencyPct: number;
  sourceMarkupPct: number;
}

export interface ProductHistorySearchResponse {
  success: true;
  items: ProductHistoryObservation[];
  total: number;
  limit: number;
}

export type SuggestionMethod = 'quarterly' | 'annualized';
export type SuggestionConfidence = 'high' | 'medium' | 'low';

export interface ProductHistorySuggestionRequest {
  selectedObservationId: string;
  confirmedCandidateObservationIds?: string[];
  analysisDate: string;
  expectedPurchaseDate: string;
}

export interface ProductHistorySuggestion {
  success: true;
  status: 'ready' | 'insufficient_history';
  method: SuggestionMethod | null;
  confidence: SuggestionConfidence | null;
  suggestedContingencyPct: number | null;
  rate?: number;
  forecastDays?: number;
  highRisk?: boolean;
  included: ProductHistoryObservation[];
  excluded: Array<{ observationId: string; reason: string }>;
}

export interface ProductHistoryAddSelection {
  observation: ProductHistoryObservation;
  suggestion: ProductHistorySuggestion | null;
  applySuggestion: boolean;
  expectedPurchaseDateOverride?: string;
}
