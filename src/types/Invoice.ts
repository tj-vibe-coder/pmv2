export interface BillingMilestone {
  id: string;
  label: string;
  trigger_pct: number;   // progress % at which this milestone becomes eligible (0 = DP / immediate)
  billing_pct: number;   // % of contract amount to invoice at this milestone
  pb_number: string;     // e.g. "PB1", "PB2"
}

export interface ScanFile {
  onedrive_item_id: string;
  onedrive_web_url: string;
  filename: string;
  uploaded_at: string;
}

export interface ProjectInvoice {
  id: string;
  project_id: string;
  /** Cached project display name — stored at write time so the dashboard
   *  doesn't need to join to the projects collection on every load. */
  project_name?: string;
  project_no?: string;
  invoice_no: string;
  invoice_date: string;         // 'YYYY-MM-DD'
  amount: number;
  payment_terms_days: number;   // 0 (upon receipt) | 30 | 45 | 60 | 90 | custom
  due_date: string;             // 'YYYY-MM-DD'
  amount_collected: number;
  collection_date?: string;     // 'YYYY-MM-DD' — date of last / full collection
  pb_number?: string;
  scan_file?: ScanFile | null;
  notes?: string;
  /** Counterparty this invoice is billed to. On ACTI-joint projects IOCT may bill
   *  the partner (ACTI) or the end customer directly — it varies per invoice.
   *  Absent/'customer' = billed to the end customer (the default, back-compatible). */
  bill_to?: BillToKind;
  bill_to_name?: string;
  /** Customer expanded withholding tax (EWT / BIR 2307). Not cash. Settles AR
   *  as a tax credit. `amount_collected` stays cash only. */
  wht_amount?: number;
  /** Creditable WHT rate as a whole-number percent (1, 2, 5, …). */
  wht_rate_pct?: number;
  /** Date on the 2307 / withholding event if known (YYYY-MM-DD). */
  wht_date?: string;
  /** Certificate number or other 2307 reference when received. */
  wht_2307_ref?: string;
  /** Journal amount is not proof of the form. expected = recorded from books;
   *  received = certificate on file. */
  wht_2307_status?: 'expected' | 'received';
  /** Provenance for a backfill or manual entry, e.g. sales-journal-2026. */
  wht_source?: string;
  created_at: string;
  updated_at: string;
}

export type BillToKind = 'customer' | 'acti';

export const BILL_TO_OPTIONS: { label: string; value: BillToKind }[] = [
  { label: 'End customer', value: 'customer' },
  { label: 'ACTI (partner)', value: 'acti' },
];

export type InvoiceStatus = 'paid' | 'partial' | 'overdue' | 'unpaid';

export function invoiceWht(inv: Pick<ProjectInvoice, 'wht_amount'>): number {
  const n = Number(inv.wht_amount);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function invoiceCash(inv: Pick<ProjectInvoice, 'amount_collected'>): number {
  const n = Number(inv.amount_collected);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Cash + recognized EWT. This is what settles AR — not cash alone. */
export function invoiceSettled(inv: Pick<ProjectInvoice, 'amount_collected' | 'wht_amount'>): number {
  return invoiceCash(inv) + invoiceWht(inv);
}

export function invoiceOutstanding(inv: Pick<ProjectInvoice, 'amount' | 'amount_collected' | 'wht_amount'>): number {
  return Math.max(0, (Number(inv.amount) || 0) - invoiceSettled(inv));
}

/** Cash still due after EWT. Cap for the collect dialog. */
export function invoiceCashDue(inv: Pick<ProjectInvoice, 'amount' | 'amount_collected' | 'wht_amount'>): number {
  return Math.max(0, (Number(inv.amount) || 0) - invoiceWht(inv) - invoiceCash(inv));
}

export function getInvoiceStatus(inv: ProjectInvoice): InvoiceStatus {
  if (inv.amount > 0 && invoiceOutstanding(inv) <= 0.005) return 'paid';
  if (invoiceSettled(inv) > 0) return 'partial';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (inv.due_date && new Date(inv.due_date) < today) return 'overdue';
  return 'unpaid';
}

export function computeDueDate(invoiceDate: string, termsDays: number): string {
  // Note: termsDays=0 is valid ("upon receipt") — do NOT use !termsDays as the guard
  if (!invoiceDate || termsDays == null || isNaN(termsDays)) return '';
  const d = new Date(invoiceDate);
  d.setDate(d.getDate() + termsDays);
  return d.toISOString().slice(0, 10);
}

/** Human-readable label for a payment_terms_days value. */
export function formatPaymentTerms(days: number): string {
  if (days === 0) return 'Upon receipt';
  return `${days} days`;
}

export const PAYMENT_TERMS_OPTIONS: { label: string; value: number }[] = [
  { label: 'Upon receipt', value: 0 },
  { label: '30 days', value: 30 },
  { label: '45 days', value: 45 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
];
