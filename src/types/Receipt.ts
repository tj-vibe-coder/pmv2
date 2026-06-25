import type { LiquidationCategoryType } from '../data/financeCategories';

/** A single line item extracted from a receipt. */
export interface ReceiptLineItem {
  description: string;
  qty: number | null;
  unitPrice: number | null;
  amount: number | null;
}

/** Structured data extracted from a receipt photo/PDF by the AI parser. */
export interface ParsedReceipt {
  vendor: string | null;
  /** ISO date, YYYY-MM-DD. */
  date: string | null;
  /** ISO currency code; defaults to 'PHP' when the parser is unsure. */
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  paymentMethod: string | null;
  /** Auto-suggested expense category, mapped onto the canonical liquidation categories. */
  suggestedCategory: LiquidationCategoryType;
  lineItems: ReceiptLineItem[];
  /** Model confidence 0..1. */
  confidence: number;
}

/** Response envelope from POST /api/receipts/parse. */
export interface ParsedReceiptResponse {
  ok: boolean;
  receipt?: ParsedReceipt;
  error?: string;
}
