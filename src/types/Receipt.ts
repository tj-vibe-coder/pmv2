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
  /** Supplier / merchant business name. */
  vendor: string | null;
  /** Plain summary of the goods/services purchased (not the vendor name). */
  description: string | null;
  /** Receipt/invoice serial number as printed. */
  invoiceNumber: string | null;
  /** Document type, e.g. 'Service Invoice' | 'Sales Invoice' | 'Official Receipt' | 'Other'. */
  invoiceType: string | null;
  /** ISO date, YYYY-MM-DD. */
  date: string | null;
  /** ISO currency code; defaults to 'PHP' when the parser is unsure. */
  currency: string;
  subtotal: number | null;
  /** VAT / tax amount, or null on non-VAT receipts. */
  tax: number | null;
  /** True for VAT receipts, false for explicitly non-VAT, null if unclear. */
  vatable: boolean | null;
  total: number | null;
  paymentMethod: string | null;
  /** Auto-suggested expense category, mapped onto the canonical liquidation categories. */
  suggestedCategory: LiquidationCategoryType;
  /** AI suggestion: is this a write-off (income-tax-deductible business expense)? null if unclear. */
  deductible: boolean | null;
  /** Short reason explaining the deductible suggestion. */
  deductibleReason: string | null;
  /** Buyer/customer name as written on the receipt. */
  customerName: string | null;
  /** Buyer/customer TIN as written. */
  customerTin: string | null;
  /** Buyer/customer address as written. */
  customerAddress: string | null;
  /** Validation of the buyer block against IOCT's registered details. */
  customerValidation: {
    nameOk: boolean;
    tinOk: boolean;
    addressOk: boolean;
    issues: string[];
  } | null;
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
