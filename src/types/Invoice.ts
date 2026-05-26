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
  payment_terms_days: number;   // 30 | 45 | 60 | 90 | custom
  due_date: string;             // 'YYYY-MM-DD'
  amount_collected: number;
  collection_date?: string;     // 'YYYY-MM-DD' — date of last / full collection
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
  if (!invoiceDate || !termsDays) return '';
  const d = new Date(invoiceDate);
  d.setDate(d.getDate() + termsDays);
  return d.toISOString().slice(0, 10);
}

export const PAYMENT_TERMS_OPTIONS: { label: string; value: number }[] = [
  { label: '30 days', value: 30 },
  { label: '45 days', value: 45 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
];
