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
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = 'paid' | 'partial' | 'overdue' | 'unpaid';

export function getInvoiceStatus(inv: ProjectInvoice): InvoiceStatus {
  if (inv.amount > 0 && inv.amount_collected >= inv.amount) return 'paid';
  if (inv.amount_collected > 0) return 'partial';
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
